# frozen_string_literal: true

# == Schema Information
#
# Table name: notifications
#
#  id                :integer          not null, primary key
#  notifiable_id     :integer
#  notifiable_type   :string
#  message           :text
#  status            :integer          default("unread")
#  title             :string
#  notification_type :integer          default("chat")
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  createable_type   :string
#  createable_id     :bigint
#
require 'test_helper'

class NotificationTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
