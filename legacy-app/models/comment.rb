# frozen_string_literal: true

# == Schema Information
#
# Table name: comments
#
#  id                      :integer          not null, primary key
#  body                    :string
#  commentable_id          :integer
#  commentable_type        :string
#  created_by_id           :integer
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  created_by_candidate_id :integer
#
class Comment < ApplicationRecord
  belongs_to :commentable, polymorphic: true, optional: true
  belongs_to :created_by, class_name: 'User', foreign_key: :created_by_id, optional: true
  belongs_to :created_by_candidate, class_name: 'Candidate', foreign_key: :created_by_candidate_id, optional: true
end
