require 'test_helper'

class Company::LeavesControllerTest < ActionController::TestCase
  setup do
    @company_leafe = company_leaves(:one)
  end

  test "should get index" do
    get :index
    assert_response :success
    assert_not_nil assigns(:company_leaves)
  end

  test "should get new" do
    get :new
    assert_response :success
  end

  test "should create company_leafe" do
    assert_difference('Company::Leave.count') do
      post :create, company_leafe: { from_date: @company_leafe.from_date, leave_type: @company_leafe.leave_type, reason: @company_leafe.reason, response_message: @company_leafe.response_message, status: @company_leafe.status, till_date: @company_leafe.till_date }
    end

    assert_redirected_to company_leafe_path(assigns(:company_leafe))
  end

  test "should show company_leafe" do
    get :show, id: @company_leafe
    assert_response :success
  end

  test "should get edit" do
    get :edit, id: @company_leafe
    assert_response :success
  end

  test "should update company_leafe" do
    patch :update, id: @company_leafe, company_leafe: { from_date: @company_leafe.from_date, leave_type: @company_leafe.leave_type, reason: @company_leafe.reason, response_message: @company_leafe.response_message, status: @company_leafe.status, till_date: @company_leafe.till_date }
    assert_redirected_to company_leafe_path(assigns(:company_leafe))
  end

  test "should destroy company_leafe" do
    assert_difference('Company::Leave.count', -1) do
      delete :destroy, id: @company_leafe
    end

    assert_redirected_to company_leaves_path
  end
end
