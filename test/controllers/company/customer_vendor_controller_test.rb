# frozen_string_literal: true

require 'test_helper'

class Company::CustomerVendorControllerTest < ActionDispatch::IntegrationTest
  test 'should get import_customer_vendor' do
    get company_customer_vendor_import_customer_vendor_url
    assert_response :success
  end
end
