# frozen_string_literal: true

# == Schema Information
#
# Table name: legal_documents
#
#  id              :bigint           not null, primary key
#  candidate_id    :integer
#  title           :string
#  file            :string
#  exp_date        :date
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  document_number :string
#  start_date      :date
#
require 'test_helper'

class LegalDocumentTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
