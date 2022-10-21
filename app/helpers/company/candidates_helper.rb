# frozen_string_literal: true

module Company::CandidatesHelper
  def is_hot?(can)
    CandidatesCompany.find_by(candidate_id: can.id, company_id: current_company.id).hot_candidate?
  end

  def etyme_recruiter_check(recruiter_id)
    if current_company.present?
      recruiter = User.find_by(email:"bot@etyme.com")

      "Added By Etyme Bot" if recruiter_id == recruiter.id
    end
  end
end
