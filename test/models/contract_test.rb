# frozen_string_literal: true

# == Schema Information
#
# Table name: contracts
#
#  id                    :integer          not null, primary key
#  job_application_id    :integer
#  job_id                :integer
#  start_date            :date
#  end_date              :date
#  message_from_hiring   :string
#  response_from_vendor  :string
#  created_by_id         :integer
#  respond_by_id         :integer
#  responed_at           :string
#  status                :integer          default("pending")
#  assignee_id           :integer
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  billing_frequency     :integer
#  time_sheet_frequency  :integer
#  company_id            :integer
#  next_invoice_date     :date
#  is_commission         :boolean          default(FALSE)
#  commission_type       :integer
#  commission_amount     :float            default(0.0)
#  max_commission        :float
#  commission_for_id     :integer
#  received_by_signature :json
#  received_by_name      :string
#  sent_by_signature     :json
#  sent_by_name          :string
#  contractable_id       :integer
#  contractable_type     :string
#  parent_contract_id    :integer
#  contract_type         :integer
#  work_location         :string
#  candidate_id          :integer
#  client_id             :integer
#  number                :string
#  salary_to_pay         :decimal(, )      default(0.0)
#  project_name          :string
#  is_client_customer    :boolean
#  cc_job                :integer          default("remaining")
#
require 'test_helper'

class ContractTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
