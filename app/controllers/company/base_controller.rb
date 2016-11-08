class Company::BaseController < ApplicationController

  layout :company_layout

  private

  def company_layout
    'company'
  end

end