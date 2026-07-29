from rest_framework.routers import DefaultRouter
from .views import (
    EmployeeSalaryViewSet,
    PayrollBatchViewSet,
    PayrollViewSet,
    PayrollComponentViewSet,
    GeneratePayrollViewSet
)

router = DefaultRouter()
router.register("employee-salaries", EmployeeSalaryViewSet, basename="employee-salary")
router.register("payroll-batches", PayrollBatchViewSet, basename="payroll-batch")
router.register("payrolls", PayrollViewSet, basename="payroll")
router.register("payroll-components", PayrollComponentViewSet, basename="payroll-component")
router.register("generate-payroll", GeneratePayrollViewSet, basename="generate-payroll")

urlpatterns = router.urls