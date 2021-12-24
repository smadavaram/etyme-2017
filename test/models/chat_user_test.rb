# frozen_string_literal: true

# == Schema Information
#
# Table name: chat_users
#
#  id            :integer          not null, primary key
#  chat_id       :integer
#  status        :integer
#  userable_type :string
#  userable_id   :integer
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#
require 'test_helper'

class ChatUserTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
