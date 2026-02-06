from flask import Flask, request, jsonify
from datetime import datetime, timedelta
import threading

app = Flask(__name__)

# In-memory storage for simplicity
polls = {}
votes = {}
lock = threading.Lock()

@app.route("/create_poll", methods=["POST"])
def create_poll():
    data = request.json
    poll_id = data.get("poll_id")
    options = data.get("options")
    duration_sec = data.get("duration_sec", 60)  # default 60s

    if not poll_id or not options or not isinstance(options, list):
        return jsonify({"error": "Invalid data"}), 400

    start_time = datetime.now()
    end_time = start_time + timedelta(seconds=duration_sec)

    with lock:
        polls[poll_id] = {"options": options, "start": start_time, "end": end_time}
        votes[poll_id] = {}  # user_id -> option

    return jsonify({"message": f"Poll {poll_id} created", "end_time": end_time.isoformat()}), 201

@app.route("/vote", methods=["POST"])
def vote():
    data = request.json
    poll_id = data.get("poll_id")
    user_id = data.get("user_id")
    option = data.get("option")

    if poll_id not in polls:
        return jsonify({"error": "Poll not found"}), 404

    poll = polls[poll_id]
    now = datetime.now()

    if now < poll["start"] or now > poll["end"]:
        return jsonify({"error": "Voting is closed"}), 403

    if option not in poll["options"]:
        return jsonify({"error": "Invalid option"}), 400

    with lock:
        user_votes = votes[poll_id]
        if user_id in user_votes:
            return jsonify({"error": "User has already voted"}), 403
        user_votes[user_id] = option

    return jsonify({"message": "Vote recorded"}), 200

@app.route("/results/<poll_id>", methods=["GET"])
def results(poll_id):
    if poll_id not in polls:
        return jsonify({"error": "Poll not found"}), 404

    with lock:
        poll = polls[poll_id]
        user_votes = votes[poll_id]
        results_count = {opt: 0 for opt in poll["options"]}
        for opt in user_votes.values():
            results_count[opt] += 1

    return jsonify({"poll_id": poll_id, "results": results_count}), 200

if __name__ == "__main__":
    app.run(debug=True)
