import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Poll {
  id: string;
  title: string;
  options: string[];
}

const PollList: React.FC = () => {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPolls = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/polls');
        if (res.ok) {
          const data = await res.json();
          setPolls(data);
        } else {
          setError('Failed to fetch polls');
        }
      } catch (err) {
        setError('Could not connect to backend');
      } finally {
        setLoading(false);
      }
    };

    fetchPolls();
  }, []);

  if (loading) return <div className="container">Loading polls...</div>;
  if (error) return <div className="container">Error: {error}</div>;

  return (
    <div className="container">
      <h1>Available Polls</h1>
      <div className="poll-list">
        {polls.length === 0 ? (
          <p>No polls available.</p>
        ) : (
          polls.map(poll => (
            <Link key={poll.id} to={`/poll/${poll.id}`} className="poll-card">
              <h3>{poll.title}</h3>
              <p>{poll.options.length} options</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default PollList;
