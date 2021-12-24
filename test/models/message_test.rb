# frozen_string_literal: true

# == Schema Information
#
# Table name: messages
#
#  id               :integer          not null, primary key
#  body             :string
#  chat_id          :integer
#  messageable_type :string
#  messageable_id   :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  company_doc_id   :integer
#  file_status      :integer          default("pending")
#
require 'test_helper'

class MessageTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
