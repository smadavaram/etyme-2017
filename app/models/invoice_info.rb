# frozen_string_literal: true

# == Schema Information
#
# Table name: invoice_infos
#
#  id           :bigint           not null, primary key
#  company_id   :bigint
#  invoice_term :string
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class InvoiceInfo < ApplicationRecord
  belongs_to :company
end
