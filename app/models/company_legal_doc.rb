# frozen_string_literal: true

# == Schema Information
#
# Table name: company_legal_docs
#
#  id           :bigint           not null, primary key
#  company_id   :integer
#  title        :string
#  file         :string
#  exp_date     :date
#  custome_name :string
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class CompanyLegalDoc < ApplicationRecord
end
