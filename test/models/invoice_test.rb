# frozen_string_literal: true

# == Schema Information
#
# Table name: invoices
#
#  id                  :integer          not null, primary key
#  contract_id         :integer
#  start_date          :date
#  end_date            :date
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  total_amount        :decimal(, )      default(0.0)
#  commission_amount   :decimal(, )      default(0.0)
#  billing_amount      :decimal(, )      default(0.0)
#  consultant_amount   :float            default(0.0)
#  submitted_by        :integer
#  submitted_on        :datetime
#  status              :integer          default("pending_invoice")
#  total_approve_time  :integer          default(0)
#  parent_id           :integer
#  rate                :decimal(, )      default(0.0)
#  ig_cycle_id         :integer
#  number              :string
#  balance             :decimal(, )      default(0.0)
#  invoice_type        :integer
#  sender_company_id   :bigint
#  receiver_company_id :bigint
#
require 'test_helper'

class InvoiceTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
