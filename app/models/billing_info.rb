# frozen_string_literal: true

class BillingInfo < ActiveRecord::Base
  belongs_to :company
end
