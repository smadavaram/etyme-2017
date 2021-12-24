# frozen_string_literal: true

# == Schema Information
#
# Table name: candidates_companies
#
#  candidate_id     :integer
#  company_id       :integer
#  status           :integer          default("normal")
#  candidate_status :integer          default(0)
#  id               :bigint           not null, primary key
#  created_at       :datetime         default(Sat, 18 Dec 2021 23:29:01 UTC +00:00)
#  updated_at       :datetime         default(Sat, 18 Dec 2021 23:29:01 UTC +00:00)
#
class CandidatesCompany < ApplicationRecord
  rating

  enum status: %i[normal hot_candidate]
  # enum candidate_status: %i[pending accept reject]
  enum candidate_status: %i[unsubscribed subscribed]

  belongs_to :candidate, optional: true
  belongs_to :company, optional: true
  scope :search_by, ->(term, _search_scop) { Candidate.where('lower(first_name) like :term or lower(last_name) like :term or lower(phone) like :term or lower(email) like :term ', term: "%#{term&.downcase}%") }
end
