# frozen_string_literal: true

# == Schema Information
#
# Table name: application_table_layouts
#
#  id                :integer          not null, primary key
# bench_columns       :text
# columns             :text
# user_id             :bigint
# created_at          :datetime           null: false
# updated_at          :datetime           null: false
#
class ApplicationTableLayout < ApplicationRecord
  serialize :columns, Array
  serialize :bench_columns, Array
  after_initialize :populate_default_columns, if: :new_record?
  belongs_to :user

  def populate_default_columns
    self.bench_columns = [{key: 'applicant_name', name: 'Applicant Name', display:true},
                          {key: 'hr_partner', name:'HR Partner', display:true},
                          {key: 'skills', name:'Skills', display:true},
                          {key: 'end_client_job_title', name:'End Client Job Title', display:true},
                          {key: 'client', name:'Client', display:true},
                          {key: 'client_job_location', name:'Client Job Location', display:true},
                          {key: 'client_partner', name:'Client Partner', display:true},
                          {key: 'work_type', name:'Work Type', display:true},
                          {key: 'visa', name:'Visa', display:true},
                          {key: 'applied_by', name:'Applied by', display:true},
                          {key: 'applied_at', name:'Applied at', display:true},
                          {key: 'status', name:'Status', display:true},]

      self.columns = [{key: 'applicant_name', name: 'Applicant Name', display:true},
                      {key: 'hr_partner', name:'HR Partner', display:true},
                      {key: 'skills', name:'Skills', display:true},
                      {key: 'location', name:'Location', display:true},
                      {key: 'visa', name:'Visa', display:true},]
  end

  def headers(type)
    columns = type=='Bench' ? self.bench_columns : self.columns
    columns.map {|col| col[:name] if col[:display]}
  end

  def all_columns(type)
    type=='Bench' ? self.bench_columns : self.columns
  end
end
