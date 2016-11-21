require 'test_helper'

class Company::JobsControllerTest < ActionController::TestCase
  setup do
    @company_job = company_jobs(:one)
  end

  test "should get index" do
    get :index
    assert_response :success
    assert_not_nil assigns(:company_jobs)
  end

  test "should get new" do
    get :new
    assert_response :success
  end

  test "should create company_job" do
    assert_difference('Company::Job.count') do
      post :create, company_job: {  }
    end

    assert_redirected_to company_job_path(assigns(:company_job))
  end

  test "should show company_job" do
    get :show, id: @company_job
    assert_response :success
  end

  test "should get edit" do
    get :edit, id: @company_job
    assert_response :success
  end

  test "should update company_job" do
    patch :update, id: @company_job, company_job: {  }
    assert_redirected_to company_job_path(assigns(:company_job))
  end

  test "should destroy company_job" do
    assert_difference('Company::Job.count', -1) do
      delete :destroy, id: @company_job
    end

    assert_redirected_to company_jobs_path
  end
end
