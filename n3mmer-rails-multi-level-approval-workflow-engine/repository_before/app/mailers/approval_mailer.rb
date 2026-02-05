class ApprovalMailer < ApplicationMailer
  def approval_requested(user, request)
    @user = user
    @request = request
    mail(to: user.email, subject: "Approval Required: #{request.title}")
  end

  def request_approved(user, request)
    @user = user
    @request = request
    mail(to: user.email, subject: "Approved: #{request.title}")
  end

  def request_rejected(user, request, reason)
    @user = user
    @request = request
    @reason = reason
    mail(to: user.email, subject: "Rejected: #{request.title}")
  end
end
