import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentForm from '../../components/ResidentForm';
import { api } from '../../lib/api';

export default function AddResident() {
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledFlat = searchParams.get('flat');

  async function handleSubmit(payload) {
    await api.post('/pending', payload);
    setDone(true);
  }

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> {prefilledFlat ? `Family member — ${prefilledFlat}` : 'Submission for review'}
        </span>
        <h1>{prefilledFlat ? 'Add family member' : 'Add new resident'}</h1>
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
        <ResidentForm
          initial={prefilledFlat ? { flat_number: prefilledFlat } : undefined}
          onSubmit={handleSubmit}
          submitLabel={prefilledFlat ? 'Submit family member' : 'Submit for approval'}
        />
      )}
    </Layout>
  );
}
