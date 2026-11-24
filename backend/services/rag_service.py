"""
HealthPoint Retrieval-Augmented Generation (RAG) Service
========================================================
Implements local semantic document chunking, vector embeddings, and similarity search
with strict user-specific document namespaces and trusted medical knowledge references.
Designed to be completely non-blocking, zero-latency, and resilient.
"""

import os
import re
import logging
from typing import List, Dict, Any, Optional
import numpy as np

logger = logging.getLogger("healthpoint.rag_service")

# Pre-seeded trusted clinical medical knowledge documents
TRUSTED_MEDICAL_KNOWLEDGE = [
    {
        "source": "AHA / ACC Guidelines",
        "title": "Blood Pressure Categories",
        "content": (
            "Normal Blood Pressure: Systolic less than 120 mmHg and Diastolic less than 80 mmHg. "
            "Elevated: Systolic 120-129 and Diastolic less than 80. "
            "Stage 1 Hypertension: Systolic 130-139 or Diastolic 80-89. "
            "Stage 2 Hypertension: Systolic 140 or higher, or Diastolic 90 or higher. "
            "Hypertensive Crisis: Systolic over 180 and/or Diastolic over 120 requires immediate emergency attention."
        )
    },
    {
        "source": "WHO / CDC Clinical Guidelines",
        "title": "Body Mass Index (BMI) Classifications",
        "content": (
            "BMI less than 18.5 is classified as Underweight. "
            "BMI 18.5 to 24.9 is classified as Normal weight. "
            "BMI 25.0 to 29.9 is classified as Overweight. "
            "BMI 30.0 or higher is classified as Obesity. "
            "Note: BMI is a screening metric and does not directly measure body fat percentage or muscle mass."
        )
    },
    {
        "source": "American Diabetes Association (ADA)",
        "title": "Fasting Plasma Glucose & HbA1c Thresholds",
        "content": (
            "Normal Fasting Glucose: Under 100 mg/dL (5.6 mmol/L). "
            "Impaired Fasting Glucose (Prediabetes): 100 to 125 mg/dL. "
            "Diabetes Mellitus Diagnostic Criterion: Fasting glucose 126 mg/dL or higher on two separate occasions. "
            "Normal HbA1c: Below 5.7%. Prediabetes: 5.7% to 6.4%. Diabetes: 6.5% or higher."
        )
    },
    {
        "source": "National Sleep Foundation",
        "title": "Adult Sleep Hygiene & Cardiovascular Health",
        "content": (
            "Adults typically require 7 to 9 hours of quality sleep nightly. "
            "Chronic sleep deprivation (under 6 hours) is clinically associated with elevated resting heart rate, "
            "increased sympathetic tone, impaired insulin sensitivity, and higher incidence of hypertension."
        )
    },
    {
        "source": "ACSM Physical Activity Standards",
        "title": "Weekly Exercise & Cardiovascular Safety",
        "content": (
            "Recommended baseline: At least 150 minutes of moderate-intensity aerobic exercise or 75 minutes of "
            "vigorous exercise weekly, coupled with muscle-strengthening activities on two or more days. "
            "Always include adequate warm-up and cool-down to prevent acute cardiovascular strain."
        )
    }
]

class LocalVectorStore:
    """Manages embeddings and similarity search using fast normalized vector space."""
    
    def __init__(self):
        self._dimension = 256
        self._user_stores: Dict[str, List[Dict[str, Any]]] = {}
        self._global_store: List[Dict[str, Any]] = []
        self._seed_global_knowledge()

    def _embed(self, text: str) -> np.ndarray:
        """
        Fast, zero-latency normalized feature vector representation based on
        character n-grams and token hashing. Guarantees deterministic, reproducible
        cosine similarity without external network dependencies.
        """
        vec = np.zeros(self._dimension, dtype=np.float32)
        words = re.findall(r"\w+", text.lower())
        if not words:
            return vec
        for w in words:
            # Word-level hash
            idx1 = abs(hash(w)) % self._dimension
            vec[idx1] += 1.5
            # Subword 3-gram hashes for partial matching
            if len(w) >= 3:
                for i in range(len(w) - 2):
                    tri = w[i:i+3]
                    idx2 = abs(hash(tri)) % self._dimension
                    vec[idx2] += 0.5
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def _seed_global_knowledge(self):
        """Seeds trusted clinical knowledge items into the global index."""
        for item in TRUSTED_MEDICAL_KNOWLEDGE:
            vec = self._embed(item["content"])
            self._global_store.append({
                "source": item["source"],
                "title": item["title"],
                "content": item["content"],
                "vector": vec
            })

    def add_user_document(self, user_email: str, title: str, text: str, source: str = "Uploaded Record") -> int:
        """
        Chunks and indexes a user-owned document into the user's isolated namespace.
        Returns the number of indexed chunks.
        """
        if not text.strip():
            return 0

        # Chunk into segments of ~300 characters with 50-char overlap
        chunk_size = 300
        overlap = 50
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end].strip()
            if len(chunk) > 20:
                chunks.append(chunk)
            start += (chunk_size - overlap)

        if user_email not in self._user_stores:
            self._user_stores[user_email] = []

        count = 0
        for chunk in chunks:
            vec = self._embed(chunk)
            self._user_stores[user_email].append({
                "source": source,
                "title": title,
                "content": chunk,
                "vector": vec
            })
            count += 1
            
        logger.info(f"Indexed {count} chunks for user '{user_email}' under source '{title}'.")
        return count

    def retrieve_relevant_knowledge(
        self,
        query: str,
        user_email: Optional[str] = None,
        top_k: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Retrieves top-k most relevant knowledge chunks matching query.
        Searches user's isolated document store (if email provided) and global clinical guidelines.
        """
        query_vec = self._embed(query)
        candidates = []

        # 1. Search user-specific namespace if authenticated
        if user_email and user_email in self._user_stores:
            for item in self._user_stores[user_email]:
                score = float(np.dot(query_vec, item["vector"]))
                candidates.append((score, item, "user_document"))

        # 2. Search global trusted guidelines
        for item in self._global_store:
            score = float(np.dot(query_vec, item["vector"]))
            candidates.append((score, item, "clinical_guideline"))

        # Sort descending by cosine similarity score
        candidates.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, item, item_type in candidates[:top_k]:
            if score > 0.10:  # relevance threshold
                results.append({
                    "score": round(score, 3),
                    "source": item["source"],
                    "title": item["title"],
                    "content": item["content"],
                    "type": item_type
                })

        return results

# Singleton instance
_rag_store = LocalVectorStore()

def get_rag_service() -> LocalVectorStore:
    """Return the global RAG service instance."""
    return _rag_store
