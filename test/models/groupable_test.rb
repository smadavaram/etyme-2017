# frozen_string_literal: true

# == Schema Information
#
# Table name: groupables
#
#  id             :integer          not null, primary key
#  group_id       :integer
#  groupable_type :string
#  groupable_id   :integer
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#
require 'test_helper'

class GroupableTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
