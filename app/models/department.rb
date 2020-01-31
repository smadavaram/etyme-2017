# frozen_string_literal: true

class Department < ActiveRecord::Base
  has_many :company_departments
end
