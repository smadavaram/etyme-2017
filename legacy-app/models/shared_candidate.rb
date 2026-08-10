# frozen_string_literal: true

# == Schema Information
#
# Table name: shared_candidates
#
#  id           :bigint           not null, primary key
#  candidate_id :bigint
#  shared_by_id :integer
#  shared_to_id :integer
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class SharedCandidate < ApplicationRecord
  belongs_to :candidate, optional: true
  belongs_to :shared_by, class_name: 'Company', optional: true
  belongs_to :shared_to, class_name: 'Company', optional: true

  validates_uniqueness_of :candidate_id, scope: %i[shared_to_id shared_by_id]
end
