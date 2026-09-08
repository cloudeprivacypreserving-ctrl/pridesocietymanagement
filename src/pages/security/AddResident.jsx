import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentForm from '../../components/ResidentForm';
import { api } from '../../lib/api';

export default function AddResident() {
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(payload) {
    await api.post('/pending', payload);
    setDone(true);
  }

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> Submission for review
        </span>
        <h1>Add new resident</h1>
        <div className="directory-subtitle">Submitted residents go to Admin for approval before appearing in the directory</div>
      </div>
      {done ? (
        <div className="card" style={{ maxWidth: 480 }}>
          <p>Submitted for Admin approval.</p>
          <button className="btn btn-primary" onClick={() => navigate('/security/submissions')}>
            View my submissions
          </button>
        </div>
      ) : (
        <ResidentForm onSubmit={handleSubmit} submitLabel="Submit for approval" />
      )}
    </Layout>
  );
}
