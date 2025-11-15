import requests

API_USER = "brgyconnect982@gmail.com"
API_KEY = "3A8F2098-84B6-BB7C-49D2-B9FBA9C0E1AC".strip()
SENDER_NAME = "BConnect"

data = {
  "messages": [
    {
      "source": "python",
      "from": SENDER_NAME,
      "to": "+639913583981",
      "body": "BConnect test SMS"
    }
  ]
}

r = requests.post(
    "https://rest.clicksend.com/v3/sms/send",
    json=data,
    auth=(API_USER, API_KEY)
)

print("STATUS:", r.status_code)
print("RAW:", r.text)
