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
require 'test_helper'

class CommentTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
