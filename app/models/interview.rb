class Interview < ApplicationRecord
  belongs_to :job_application

  def is_accepted?
    if self.job_application.recruiter_company_id.blank?
      accept  and accepted_by_company
    else
      accept and accepted_by_recruiter and accepted_by_company
    end
  end

end
