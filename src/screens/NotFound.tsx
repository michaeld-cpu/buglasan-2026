import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <Shell>
      <div className="empty-state">
        <strong>That page does not exist.</strong>
        <p>Check the link, or go back to your segments.</p>
        <p style={{ marginTop: '1rem' }}>
          <button className="button" onClick={() => navigate('/judge')} type="button">
            My segments
          </button>
        </p>
      </div>
    </Shell>
  );
}
