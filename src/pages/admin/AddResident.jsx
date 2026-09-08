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
      <h1>Add resident</h1>
      <ResidentForm onSubmit={handleSubmit} submitLabel="Add resident" />
    </Layout>
  );
}
