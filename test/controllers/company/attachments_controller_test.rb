# frozen_string_literal: true

require 'test_helper'

class Company::AttachmentsControllerTest < ActionController::TestCase
  test 'should get index' do
    get :index
    assert_response :success
  end
end
