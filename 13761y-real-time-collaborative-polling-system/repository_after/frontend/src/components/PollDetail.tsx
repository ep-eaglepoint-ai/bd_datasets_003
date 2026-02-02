import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';

interface Poll {
  id: string;
  title: string;
  options: string[];
}

const PollDetail: React.FC = () => {
  const { id: pollId } = useParams<{ id: string }>();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedOption, setVotedOption] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { results, isConnected } = useWebSocket(poll ? poll.id : null);

  useEffect(() => {
    if (!pollId) return;

    // Check local storage for previous vote
    const savedVote = localStorage.getItem(`voted_${pollId}`);
    if (savedVote) {
      setHasVoted(true);
      setVotedOption(savedVote);
    }

    // Fetch poll metadata
    const fetchPoll = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/polls/${pollId}`);
        if (res.ok) {
          const data = await res.json();
          setPoll(data);
        } else {
          setError("Poll not found");
        }
      } catch (err) {
        setError("Could not connect to backend");
      }
    };

    fetchPoll();
  }, [pollId]);

  const handleVote = async (option: string) => {
    if (hasVoted || !poll) return;

    try {
      const res = await fetch(`http://localhost:8000/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: option })
      });

      if (res.ok) {
        setHasVoted(true);
        setVotedOption(option);
        localStorage.setItem(`voted_${poll.id}`, option);
      } else {
        const data = await res.json();
        setError(data.detail || "Vote failed");
      }
    } catch (err) {
      setError("Vote submission failed");
    }
  };

  const totalVotes = Object.values(results).reduce((a, b) => a + b, 0);

  if (error) return (
    <div className="container">
      <p>Error: {error}</p>
      <Link to="/" className="back-link">Back to Polls</Link>
    </div>
  );
  
  if (!poll) return <div className="container">Loading poll...</div>;

  return (
    <div className="container">
      <Link to="/" className="back-link">← Back to Polls</Link>
      <h1>{poll.title}</h1>
      
      {!isConnected && <div style={{color: 'orange', fontSize: '0.8rem', textAlign: 'center', marginBottom: '1rem'}}>Connecting to live updates...</div>}

      {!hasVoted ? (
        <div className="voting-view">
          {poll.options.map(option => (
            <button 
              key={option} 
              className="poll-option"
              onClick={() => handleVote(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <div className="results-view">
          {poll.options.map(option => {
            const count = results[option] || 0;
            const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
            return (
              <div key={option} className="result-bar-wrapper">
                <div className="result-header">
                  <span>{option} {option === votedOption && " (Your Vote)"}</span>
                  <span>{count} votes ({percentage.toFixed(1)}%)</span>
                </div>
                <div className="progress-bg">
                  <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                </div>
              </div>
            );
          })}
          <div className="voted-badge">Thank you for voting! Live results shown.</div>
        </div>
      )}
    </div>
  );
};

export default PollDetail;
