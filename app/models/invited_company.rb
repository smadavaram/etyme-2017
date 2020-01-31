# frozen_string_literal: true

class InvitedCompany < ApplicationRecord
  belongs_to :invited_by, class_name: 'Company', foreign_key: 'invited_by_company_id', optional: true
  belongs_to :invited_company, class_name: 'Company', foreign_key: 'invited_company_id', optional: true
  has_many :groupables, as: :groupable
  has_many :groups, through: :groupables
end
