# frozen_string_literal: true

class Interview < ApplicationRecord
  belongs_to :job_application

  def is_accepted?
    if job_application.recruiter_company_id.blank?
      accept && accepted_by_company
    else
      accept && accepted_by_recruiter && accepted_by_company
    end
  end
end
