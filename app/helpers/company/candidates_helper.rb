module Company::CandidatesHelper
  def is_hot?(can)
    !CandidatesCompany.hot_candidate.where(candidate_id: can.id,company_id:current_company.id).present?
  end
end
