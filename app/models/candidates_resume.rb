class CandidatesResume < ApplicationRecord
  belongs_to :candidate, optional: true
end
