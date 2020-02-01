# frozen_string_literal: true

class Company::CustomerVendorController < ApplicationController
  def create
    file = current_company.company_customer_vendors.new(file: params[:file], file_type: params[:file_type])
    if file.save
      @list = current_company.company_customer_vendors.send(params[:file_type])
      flash.now[:success] = 'Customer List has been import successfully'
      respond_to do |format|
        format.js {}
      end
    else
      flash[:error] = file.errors
      redirect_to company_path(current_company.id)
    end
  end
end
