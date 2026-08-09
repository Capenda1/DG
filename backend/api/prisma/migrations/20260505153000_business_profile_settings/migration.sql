INSERT INTO "settings" ("key", "value")
VALUES (
  'business_profile',
  '{
    "companyName": "",
    "legalName": "",
    "tagline": "",
    "logoUrl": "",
    "addressLine1": "",
    "addressLine2": "",
    "city": "",
    "provinceRegion": "",
    "country": "Angola",
    "phone": "",
    "email": "",
    "website": "",
    "taxId": "",
    "businessHours": "",
    "socialFacebook": "",
    "socialInstagram": "",
    "notes": ""
  }'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
