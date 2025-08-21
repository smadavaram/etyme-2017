# frozen_string_literal: true

module Company::CandidatesHelper
  def is_hot?(can)
    CandidatesCompany.find_by(candidate_id: can.id, company_id: current_company.id).hot_candidate?
  end
end
