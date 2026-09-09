import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentForm from '../../components/ResidentForm';
import { api } from '../../lib/api';

export default function AddResident() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledFlat = searchParams.get('flat');

  async function handleSubmit(payload) {
    const resident = await api.post('/residents', payload);
    navigate(`/admin/residents/${resident.id}`);
  }

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> {prefilledFlat ? `Family member — ${prefilledFlat}` : 'Direct entry'}
        </span>
        <h1>{prefilledFlat ? 'Add family member' : 'Add new resident'}</h1>
        <div className="directory-subtitle">
          {prefilledFlat
            ? `Adds another resident at ${prefilledFlat} to the active registry`
            : 'Adds directly to the active resident registry'}
        </div>
      </div>
      <ResidentForm
        initial={prefilledFlat ? { flat_number: prefilledFlat } : undefined}
        onSubmit={handleSubmit}
        submitLabel={prefilledFlat ? 'Add family member' : 'Add resident'}
        showAdminFields
      />
    </Layout>
  );
}
