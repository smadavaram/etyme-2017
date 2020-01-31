# frozen_string_literal: true

class TaxInfo < ApplicationRecord
  belongs_to :payroll_info
end
