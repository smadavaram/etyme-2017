# frozen_string_literal: true

# == Schema Information
#
# Table name: chats
#
#  id            :integer          not null, primary key
#  slug          :string
#  chatable_type :string
#  chatable_id   :integer
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  company_id    :integer
#
require 'test_helper'

class ChatTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
