# frozen_string_literal: true

# == Schema Information
#
# Table name: statuses
#
#  id              :integer          not null, primary key
#  statusable_type :string
#  statusable_id   :integer
#  user_id         :integer
#  note            :string
#  status_type     :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
require 'test_helper'

class StatusTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
