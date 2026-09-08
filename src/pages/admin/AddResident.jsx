import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ResidentForm from '../../components/ResidentForm';
import { api } from '../../lib/api';

export default function AddResident() {
  const navigate = useNavigate();

  async function handleSubmit(payload) {
    const resident = await api.post('/residents', payload);
    navigate(`/admin/residents/${resident.id}`);
  }

  return (
    <Layout>
      <div className="form-page-header">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> Direct entry
        </span>
        <h1>Add new resident</h1>
        <div className="directory-subtitle">Adds directly to the active resident registry</div>
      </div>
      <ResidentForm onSubmit={handleSubmit} submitLabel="Add resident" showAdminFields />
    </Layout>
  );
}
