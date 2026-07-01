from fastapi import HTTPException, status
import httpx
import random
from backend.database.mongodb import get_database

async def get_doctors_controller(lat: float = None, lng: float = None):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    # Default coordinates: Bengaluru, India (if not provided)
    if lat is None or lng is None:
        lat = 12.9716
        lng = 77.5946

    doctors_list = []
    
    # Try querying OSM Overpass API for hospitals/doctors/clinics
    try:
        overpass_url = "https://overpass-api.de/api/interpreter"
        # Search for hospitals, doctors, and clinics in a 10km radius
        overpass_query = f"""
        [out:json][timeout:10];
        (
          node(around:8000,{lat},{lng})[amenity=hospital];
          node(around:8000,{lat},{lng})[amenity=doctors];
          node(around:8000,{lat},{lng})[amenity=clinic];
        );
        out body 15;
        """
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.post(overpass_url, data={"data": overpass_query})
            if res.status_code == 200:
                elements = res.json().get("elements", [])
                
                # Mock doctors names to prepend/assign
                doc_names = [
                    "Dr. Sarah Mitchell", "Dr. James Chen", "Dr. Emily Rodriguez", 
                    "Dr. Michael Thompson", "Dr. Priya Patel", "Dr. Robert Kim", 
                    "Dr. Rajesh Kumar", "Dr. Ananya Sharma", "Dr. Amit Verma",
                    "Dr. Sandeep Hedge", "Dr. Kavita Rao", "Dr. Vikram Seth"
                ]
                specialties = [
                    "Cardiologist", "Neurologist", "Dermatologist", 
                    "Orthopedist", "Pediatrician", "Psychiatrist", 
                    "General Physician", "Gynecologist", "Ophthalmologist"
                ]
                educations = [
                    "Harvard Medical School", "Johns Hopkins University", "Stanford Medical School",
                    "Mayo Clinic School of Medicine", "UCSF School of Medicine", "Columbia Medical School",
                    "All India Institute of Medical Sciences (AIIMS)", "Bangalore Medical College"
                ]
                languages_pool = [["English", "Hindi"], ["English", "Spanish"], ["English", "Hindi", "Kannada"], ["English", "Tamil"]]

                for idx, node in enumerate(elements):
                    tags = node.get("tags", {})
                    facility_name = tags.get("name", "Medical Center")
                    
                    # Generate realistic details
                    d_name = doc_names[idx % len(doc_names)]
                    specialty = tags.get("healthcare:specialty", tags.get("speciality", specialties[idx % len(specialties)]))
                    experience = f"{random.randint(6, 24)} yrs"
                    fee = float(random.choice([400, 500, 600, 800, 1000, 1200]))
                    rating = round(random.uniform(4.5, 4.9), 1)
                    reviews = random.randint(40, 480)
                    available = random.choice([True, True, False])
                    
                    # Leaflet coordinates
                    n_lat = node.get("lat")
                    n_lng = node.get("lon")

                    doctors_list.append({
                        "id": idx + 1000, # Avoid collision with seeded IDs
                        "name": f"{d_name}",
                        "specialty": specialty,
                        "hospital": facility_name,
                        "rating": rating,
                        "reviews": reviews,
                        "experience": experience,
                        "fee": fee,
                        "available": available,
                        "nextAvailable": "Today, " + random.choice(["2:30 PM", "3:00 PM", "5:00 PM", "10:30 AM"]),
                        "verified": True,
                        "languages": languages_pool[idx % len(languages_pool)],
                        "education": educations[idx % len(educations)],
                        "latitude": n_lat,
                        "longitude": n_lng
                    })
    except Exception as e:
        print(f"Overpass API error: {e}. Falling back to MongoDB doctors list.")
        
    if not doctors_list:
        # Fallback to DB doctors list
        doctors_cursor = db.doctors.find({})
        async for doc in doctors_cursor:
            doc["id"] = int(doc.get("id", random.randint(1, 999)))
            if "_id" in doc:
                del doc["_id"]
            # Assign fallback coordinates close to Bengaluru
            if "latitude" not in doc:
                doc["latitude"] = 12.9716 + random.uniform(-0.05, 0.05)
                doc["longitude"] = 77.5946 + random.uniform(-0.05, 0.05)
            doctors_list.append(doc)
            
    return doctors_list
