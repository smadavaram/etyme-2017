# frozen_string_literal: true

# == Schema Information
#
# Table name: reminders
#
#  id                :integer          not null, primary key
#  title             :string
#  remind_at         :datetime
#  status            :integer          default("done")
#  user_id           :integer
#  reminderable_type :string
#  reminderable_id   :integer
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#
require 'test_helper'

class ReminderTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
