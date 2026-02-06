import React, { useState, useEffect } from 'react';
import './Poll.css';

function Poll({ pollId, onBack }) {
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);

  useEffect(() => {
    const voted = localStorage.getItem(`voted_${pollId}`);
    if (voted) {
      setHasVoted(true);
    }

    const fetchPoll = async () => {
      try {
        const response = await fetch(`/api/polls/${pollId}`);
        if (!response.ok) {
          setError('Poll not found');
          setLoading(false);
          return;
        }
        const data = await response.json();
        setPoll(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load poll');
        setLoading(false);
      }
    };

    fetchPoll();
  }, [pollId]);

  const handleVote = async () => {
    if (selectedOption === null) return;

    if (hasVoted) {
      setError('Already voted');
      return;
    }

    try {
      const response = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionIndex: selectedOption }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to vote');
        return;
      }

      localStorage.setItem(`voted_${pollId}`, 'true');
      setHasVoted(true);
      setPoll(data);
    } catch (err) {
      setError('Failed to vote. Please try again.');
    }
  };

  const getWinningIndices = () => {
    if (!poll || !poll.votes) return [];
    const maxVotes = Math.max(...poll.votes);
    if (maxVotes === 0) return [];
    return poll.votes.map((v, i) => v === maxVotes ? i : -1).filter(i => i !== -1);
  };

  const copyShareLink = () => {
    const link = `${window.location.origin}/poll/${pollId}`;
    navigator.clipboard.writeText(link);
    alert('Link copied to clipboard!');
  };

  if (loading) {
    return <div className="poll loading">Loading...</div>;
  }

  if (error && !poll) {
    return (
      <div className="poll error-container">
        <p className="error">{error}</p>
        <button onClick={onBack} className="back-btn">Create New Poll</button>
      </div>
    );
  }

  const winningIndices = getWinningIndices();

  return (
    <div className="poll">
      <div className="poll-header">
        <h2>{poll.question}</h2>
        <div className="poll-id">Poll ID: {pollId}</div>
        <button onClick={copyShareLink} className="share-btn">
          📋 Copy Share Link
        </button>
      </div>

      {!hasVoted ? (
        <div className="voting-section">
          <div className="options">
            {poll.options.map((option, index) => (
              <label key={index} className="option-label">
                <input
                  type="radio"
                  name="poll-option"
                  value={index}
                  checked={selectedOption === index}
                  onChange={() => setSelectedOption(index)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
          <button
            onClick={handleVote}
            className="vote-btn"
            disabled={selectedOption === null}
          >
            Submit Vote
          </button>
        </div>
      ) : (
        <div className="results-section">
          <h3>Results</h3>
          <div className="results">
            {poll.options.map((option, index) => (
              <div
                key={index}
                className={`result-item ${winningIndices.includes(index) ? 'winner' : ''}`}
              >
                <div className="result-header">
                  <span className="option-name">{option}</span>
                  <span className="vote-count">
                    {poll.votes[index]} vote{poll.votes[index] !== 1 ? 's' : ''} ({poll.percentages[index]}%)
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${poll.percentages[index]}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onBack} className="back-btn">Create New Poll</button>
    </div>
  );
}

export default Poll;
