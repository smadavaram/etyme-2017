# frozen_string_literal: true

# == Schema Information
#
# Table name: tax_infos
#
#  id              :bigint           not null, primary key
#  payroll_info_id :bigint
#  tax_term        :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
class TaxInfo < ApplicationRecord
  belongs_to :payroll_info
end
