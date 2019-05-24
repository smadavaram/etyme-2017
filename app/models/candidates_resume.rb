class CandidatesResume < ApplicationRecord
  belongs_to :candidate, optional: true
  scope :primary_resume, -> { where(is_primary: true).first}

end
