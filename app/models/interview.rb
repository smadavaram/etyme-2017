class Interview < ApplicationRecord
  belongs_to :job_application
  has_ancestry
  def is_accepted?
    accept and accepted_by_recruiter and accepted_by_company
  end

end
