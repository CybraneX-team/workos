import { useNavigate } from 'react-router-dom';
import OrganisationPolytope from '../components/OrganisationPolytope';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/db/companies';

export default function PolytopePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { company } = useCompany(profile?.company_id);
  
  // Use the actual company name from the database, fallback to heuristic if loading
  const companyName = company?.name || (profile?.company_id ? profile?.first_name ? `${profile.first_name}'s workspace` : 'My workspace' : 'Your Organisation');

  return (
    <div className="fixed inset-0 pt-14 bg-[#05040f]">
      <OrganisationPolytope 
        companyName={companyName}
        is3DRoute={true}
        onClose={() => navigate('/overview')} 
      />
    </div>
  );
}
