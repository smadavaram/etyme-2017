# frozen_string_literal: true

# == Schema Information
#
# Table name: groups
#
#  id            :integer          not null, primary key
#  group_name    :string
#  company_id    :integer
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  member_type   :string
#  branchout     :string           default([]), is an Array
#  branchoutname :string
#  branch_array  :text             default([]), is an Array
#
require 'test_helper'

class GroupTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
