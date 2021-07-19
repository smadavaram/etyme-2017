# frozen_string_literal: true

class CandidatesCompany < ApplicationRecord
  enum status: %i[normal hot_candidate]
  enum candidate_status: %i[pending accept reject]

  belongs_to :candidate, optional: true
  belongs_to :company, optional: true
  scope :search_by, ->(term, _search_scop) { Candidate.where('lower(first_name) like :term or lower(last_name) like :term or lower(phone) like :term or lower(email) like :term ', term: "%#{term&.downcase}%") }
end
